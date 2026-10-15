// Original Canvas artwork. No downloaded assets or network requests.
export function paintDemo(wash, ink, width, height) {
  const scale = Math.min(width / 1200, height / 850);
  const sx = width < height ? width / 1100 : scale,
    sy = width < height ? height / 950 : scale;
  for (const ctx of [wash, ink]) {
    ctx.save();
    ctx.translate((width - 1200 * sx) / 2, (height - 800 * sy) / 2);
    ctx.scale(sx, sy);
  }
  const arch = new Path2D(
    "M270 708V338C270 145 411 73 600 73S930 145 930 338V708Z",
  );
  wash.save();
  wash.clip(arch);
  const sky = wash.createLinearGradient(0, 90, 0, 720);
  sky.addColorStop(0, "#ecbda0");
  sky.addColorStop(0.56, "#f1d5af");
  sky.addColorStop(1, "#e69c7d");
  wash.fillStyle = sky;
  wash.fillRect(250, 60, 720, 700);
  const sun = wash.createLinearGradient(0, 170, 0, 400);
  sun.addColorStop(0, "#d65e69");
  sun.addColorStop(1, "#e99370");
  wash.fillStyle = sun;
  wash.beginPath();
  wash.arc(650, 286, 112, 0, Math.PI * 2);
  wash.fill();
  const mountains = [
    [
      "#ac92ac",
      "M230 505Q360 400 445 455Q510 482 590 410Q660 342 729 432Q810 506 980 375V780H220Z",
    ],
    [
      "#737da1",
      "M220 568Q361 457 458 521Q550 580 662 483Q730 425 824 526Q890 580 980 510V780H220Z",
    ],
    [
      "#405d7c",
      "M220 610Q370 535 468 597Q560 650 694 567Q840 472 980 601V780H220Z",
    ],
    [
      "#263f59",
      "M220 710Q420 581 563 687Q701 748 811 645Q890 590 980 640V780H220Z",
    ],
  ];
  for (const [color, path] of mountains) {
    wash.fillStyle = color;
    wash.fill(new Path2D(path));
  }
  wash.strokeStyle = "#f6d8a244";
  wash.lineWidth = 1;
  for (let i = 0; i < 17; i++) {
    wash.beginPath();
    wash.moveTo(300, 585 + i * 7);
    wash.bezierCurveTo(475, 482 + i * 8, 610, 730 + i * 3, 980, 510 + i * 9);
    wash.stroke();
  }
  for (let i = 0; i < 2200; i++) {
    const x = 250 + (Math.sin(i * 79.3) * 0.5 + 0.5) * 720,
      y = 60 + (Math.cos(i * 47.1) * 0.5 + 0.5) * 700;
    wash.fillStyle = i % 2 ? "#ffffff10" : "#3b334b0c";
    wash.fillRect(x, y, 1.2, 1.2);
  }
  wash.restore();
  ink.lineCap = "round";
  ink.lineJoin = "round";
  function branch(x, y, direction, length, color) {
    ink.save();
    ink.translate(x, y);
    ink.rotate(direction);
    ink.strokeStyle = color;
    ink.fillStyle = color;
    ink.lineWidth = 2;
    ink.beginPath();
    ink.moveTo(0, 0);
    ink.bezierCurveTo(-10, -length * 0.3, 20, -length * 0.65, 0, -length);
    ink.stroke();
    for (let j = 1; j < 7; j++) {
      const yy = (-length * j) / 8,
        sign = j % 2 ? -1 : 1,
        leafLength = 44 + (7 - j) * 6;
      ink.save();
      ink.translate(j < 4 ? 0 : 8, yy);
      ink.rotate(sign * 0.85);
      ink.beginPath();
      ink.moveTo(0, 0);
      ink.bezierCurveTo(
        -25,
        -leafLength * 0.4,
        -18,
        -leafLength * 0.8,
        0,
        -leafLength,
      );
      ink.bezierCurveTo(19, -leafLength * 0.8, 25, -leafLength * 0.4, 0, 0);
      ink.fill();
      ink.strokeStyle = color === "#20394d" ? "#edc79588" : "#fff2cb77";
      ink.lineWidth = 0.7;
      ink.beginPath();
      ink.moveTo(0, 0);
      ink.quadraticCurveTo(4, -leafLength / 2, 0, -leafLength);
      ink.stroke();
      ink.restore();
    }
    ink.restore();
  }
  branch(352, 752, -0.28, 327, "#20394d");
  branch(851, 741, 0.25, 256, "#ddb483");
  branch(916, 743, 0.55, 174, "#20394d");
  ink.strokeStyle = "#9c768066";
  ink.lineWidth = 1;
  ink.stroke(arch);
  for (const [x, y, r] of [
    [385, 250, 6],
    [805, 207, 4],
    [830, 316, 7],
    [489, 184, 3],
  ]) {
    ink.strokeStyle = "#ffefce";
    ink.lineWidth = 1.2;
    ink.beginPath();
    ink.moveTo(x - r, y);
    ink.lineTo(x + r, y);
    ink.moveTo(x, y - r);
    ink.lineTo(x, y + r);
    ink.stroke();
  }
  ink.strokeStyle = "#c4a18477";
  ink.lineWidth = 0.7;
  ink.beginPath();
  ink.moveTo(285, 755);
  ink.lineTo(915, 755);
  ink.stroke();
  wash.restore();
  ink.restore();
}
