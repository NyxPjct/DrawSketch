"""Install publisher-supplied signing material on an ephemeral macOS CI runner."""
import base64
import hashlib
import os
import plistlib
import secrets
import subprocess
from pathlib import Path

if os.uname().sysname != 'Darwin':
    raise SystemExit('iOS signing requires macOS')
for name in ['CERTIFICATE', 'CERTIFICATE_PASSWORD', 'PROVISIONING_PROFILE', 'EXPORT_OPTIONS']:
    if not os.environ.get(name):
        raise SystemExit(f'Configure {name} securely in the signed-distribution GitHub environment')
root = Path(os.environ['RUNNER_TEMP'])
certificate = root / 'publisher.p12'
profile = root / 'publisher.mobileprovision'
options = root / 'ExportOptions.plist'
keychain = root / 'drawsketch-signing.keychain-db'
for path, name in [(certificate, 'CERTIFICATE'), (profile, 'PROVISIONING_PROFILE'), (options, 'EXPORT_OPTIONS')]:
    path.write_bytes(base64.b64decode(os.environ[name], validate=True))
    path.chmod(0o600)
plistlib.loads(options.read_bytes())
password = secrets.token_urlsafe(32)

def security(*args, capture=False):
    # Never include command arguments in failure output; they may contain passwords.
    result = subprocess.run(['security', *args], capture_output=True)
    if result.returncode:
        raise SystemExit('Apple signing setup failed; verify the certificate, profile, password and runner keychain access')
    return result.stdout if capture else None

security('create-keychain', '-p', password, str(keychain))
security('set-keychain-settings', '-lut', '21600', str(keychain))
security('unlock-keychain', '-p', password, str(keychain))
security('import', str(certificate), '-P', os.environ['CERTIFICATE_PASSWORD'], '-A', '-t', 'cert', '-f', 'pkcs12', '-k', str(keychain))
security('set-key-partition-list', '-S', 'apple-tool:,apple:', '-k', password, str(keychain))
previous = security('list-keychains', '-d', 'user', capture=True).decode()
import shlex
security('list-keychains', '-d', 'user', '-s', str(keychain), *shlex.split(previous))
decoded = security('cms', '-D', '-i', str(profile), capture=True)
profile_data = plistlib.loads(decoded)
identifier = profile_data['UUID']
if not isinstance(identifier, str) or any(c not in '0123456789abcdefABCDEF-' for c in identifier):
    raise SystemExit('Invalid provisioning profile UUID')
profiles = Path.home() / 'Library/Developer/Xcode/UserData/Provisioning Profiles'
profiles.mkdir(parents=True, exist_ok=True)
(profiles / f'{identifier}.mobileprovision').write_bytes(profile.read_bytes())
with open(os.environ['GITHUB_ENV'], 'a') as target:
    target.write(f'DRAWSKETCH_IOS_EXPORT_OPTIONS={options}\n')
    target.write(f'DRAWSKETCH_IOS_PROFILE_UUID={identifier}\n')
    identities = security('find-identity', '-v', '-p', 'codesigning', str(keychain), capture=True).decode().upper()
    candidates = [hashlib.sha1(cert).hexdigest().upper() for cert in profile_data['DeveloperCertificates']]
    matching = [fingerprint for fingerprint in candidates if fingerprint in identities]
    if not matching:
        raise SystemExit('The installed certificate does not match the provisioning profile')
    target.write(f'DRAWSKETCH_IOS_SIGNING_IDENTITY={matching[0]}\n')
certificate.unlink()
print('Publisher certificate and provisioning profile installed in the temporary runner')
