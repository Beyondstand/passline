import { boardSize } from './rules.js';

const { width, height } = boardSize;
const sector = {
  西北: [66, 55], 北: [500, 42], 东北: [921, 62],
  西: [56, 285], 东: [941, 325], 西南: [75, 515], 南: [500, 529], 东南: [925, 513],
};

function shelf(ctx, path, { upper, lower, ridge, depth = 12 }) {
  const outline = new Path2D(path);
  ctx.save();
  ctx.translate(0, depth);
  ctx.fillStyle = '#050e1bc4';
  ctx.strokeStyle = '#06121bbc';
  ctx.lineWidth = 7;
  ctx.stroke(outline);
  ctx.fill(outline);
  ctx.restore();
  const face = ctx.createLinearGradient(0, 30, 115, height);
  face.addColorStop(0, upper);
  face.addColorStop(1, lower);
  ctx.fillStyle = face;
  ctx.fill(outline);
  ctx.strokeStyle = ridge;
  ctx.lineWidth = 1.5;
  ctx.stroke(outline);
}

function stream(ctx, shape, layers) {
  const path = new Path2D(shape);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [weight, color] of layers) {
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.stroke(path);
  }
}

function contours(ctx, peaks, color, spin = 0) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  for (const [x, y, rx, ry, seed] of peaks) {
    for (let r = .22; r <= 1; r += .105) {
      ctx.beginPath();
      for (let step = 0; step < 56; step++) {
        const a = 2 * Math.PI * step / 56;
        const shape = 1 + .14 * Math.cos(3 * a + seed) + .09 * Math.sin(5 * a - seed);
        const ox = Math.cos(a) * rx * r * shape;
        const oy = Math.sin(a) * ry * r * shape;
        const px = x + ox * Math.cos(spin) - oy * Math.sin(spin);
        const py = y + ox * Math.sin(spin) + oy * Math.cos(spin);
        if (step === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
}

function paintSky(ctx) {
  const stone = { upper: '#4a577def', lower: '#263950', ridge: '#b4cfff9c', depth: 16 };
  shelf(ctx, 'M -20 198 Q 114 121 235 126 Q 309 98 354 146 Q 374 191 309 205 L 229 250 Q 239 338 307 382 Q 358 426 322 465 Q 224 501 116 431 Q 67 408 -20 437 Z', stone);
  shelf(ctx, 'M 1020 164 Q 901 138 766 113 Q 696 113 649 143 Q 631 202 714 228 L 778 257 Q 766 333 688 388 Q 637 434 681 465 Q 770 489 880 426 Q 925 391 1020 413 Z', stone);
  shelf(ctx, 'M 400 128 L 435 89 L 533 67 Q 617 100 607 148 L 554 183 L 465 177 Z', stone);
  shelf(ctx, 'M 416 315 Q 461 264 522 268 L 582 293 L 548 331 L 459 347 Z', stone);
  shelf(ctx, 'M 410 467 Q 441 432 513 429 Q 567 454 587 480 L 528 510 L 453 506 Z', stone);
  contours(ctx, [[165, 251, 150, 109, 2], [850, 283, 166, 120, 6], [500, 118, 94, 40, 1]], '#c5d8fa38');
  stream(ctx, 'M -40 94 C 223 14 349 83 453 51 S 774 7 1060 105 M -40 524 C 156 526 294 551 409 520 S 692 512 1020 477', [[25, '#b4cbff0e'], [1.7, '#bfd1ff6e']]);
  stream(ctx, 'M 22 342 Q 166 387 326 355 T 665 357 T 1012 350', [[12, '#c0d3ff0d'], [1.3, '#bac5ee39']]);
}

function paintEarth(ctx) {
  for (const [y, fill, ridge] of [[54, '#596045e9', '#d6c38776'], [225, '#6a5b3de9', '#dec08b8c'], [392, '#565641e9', '#cebd8587']]) {
    shelf(ctx, `M -18 ${y + 21} Q 180 ${y - 31} 314 ${y + 9} T 656 ${y + 4} Q 840 ${y - 31} 1018 ${y + 22} L 1018 ${y + 125} Q 800 ${y + 84} 666 ${y + 130} T 317 ${y + 122} Q 172 ${y + 95} -18 ${y + 131} Z`,
      { upper: fill, lower: '#363e32', ridge, depth: 12 });
    for (let dy = 15; dy <= 105; dy += 15) {
      stream(ctx, `M -16 ${y + dy + 20} Q 157 ${y + dy - 25} 312 ${y + dy + 5} T 655 ${y + dy + 4} Q 851 ${y + dy - 23} 1015 ${y + dy + 12}`, [[1, '#e9d19930']]);
    }
  }
  for (const x of [165, 817]) {
    ctx.save();
    ctx.translate(x, 158);
    ctx.rotate(x < 500 ? -.16 : .16);
    ctx.strokeStyle = '#ebd09b59';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 78, 43);
    for (let row = 8; row < 43; row += 8) ctx.strokeRect(0, row, 78, 1);
    ctx.restore();
  }
}

function paintThunder(ctx) {
  const quartz = { upper: '#493e67e0', lower: '#24263f', ridge: '#bd92e581' };
  shelf(ctx, 'M -10 103 L 135 77 L 223 122 L 317 99 L 423 162 L 371 225 L 444 278 L 367 339 L 407 397 L 311 446 L 219 473 L 112 455 L -10 511 Z', quartz);
  shelf(ctx, 'M 1010 468 L 875 500 L 780 451 L 681 476 L 579 405 L 631 351 L 557 294 L 634 227 L 598 180 L 700 119 L 776 100 L 881 120 L 1010 63 Z', quartz);
  const bolt = 'M 514 -15 L 485 62 L 520 111 L 441 178 L 496 220 L 462 277 L 540 312 L 493 352 L 555 389 L 489 468 L 521 516 L 480 593';
  stream(ctx, bolt, [[38, '#a95cf328'], [19, '#c878f05a'], [5, '#d69cffbb'], [1.5, '#ffe5ff']]);
  stream(ctx, 'M 441 178 L 363 161 L 316 193 M 555 389 L 633 408 L 679 374 M 520 111 L 592 82 M 489 468 L 415 497', [[7, '#d38cff60'], [1.8, '#f6d6ffa5']]);
  contours(ctx, [[205, 345, 193, 127, 2], [797, 230, 187, 134, 5]], '#b0a0dc35', -.28);
}

function paintWind(ctx) {
  const heights = { upper: '#3d6866e3', lower: '#24443c', ridge: '#91ceb482' };
  shelf(ctx, 'M -35 77 Q 104 47 225 81 Q 357 87 393 165 Q 426 208 360 255 Q 325 300 396 344 Q 460 440 350 497 Q 212 559 -35 507 Z', heights);
  shelf(ctx, 'M 1035 79 Q 886 61 778 94 Q 741 136 805 174 Q 836 229 726 294 Q 661 351 737 385 Q 848 440 834 504 Q 934 515 1035 482 Z', heights);
  const canyon = 'M 556 -27 C 734 91 342 131 410 220 C 459 281 687 259 649 363 C 622 438 340 435 548 597';
  stream(ctx, canyon, [[180, '#080f254a'], [135, '#18313adf'], [85, '#2b4e58aa'], [32, '#52858285'], [1.8, '#b7e8ba8c']]);
  stream(ctx, 'M 24 329 C 218 265 359 343 465 347 S 711 255 975 369 M 37 180 C 178 113 252 191 419 114 S 714 125 947 75 M 37 515 C 179 486 286 468 398 506 S 713 570 977 479',
    [[11, '#8fe7cb13'], [1.3, '#b5e4ce51']]);
  contours(ctx, [[170, 188, 201, 103, 4], [825, 101, 169, 83, 2], [786, 476, 167, 92, 6]], '#a4debf38', -.1);
}

function paintWater(ctx) {
  const bank = { upper: '#3b6077f3', lower: '#203c58', ridge: '#85c8e8b5', depth: 7 };
  shelf(ctx, 'M -25 -15 L 434 -15 Q 506 44 443 118 L 366 179 Q 340 245 304 293 Q 240 371 317 448 Q 346 504 418 590 L -25 590 Z', bank);
  shelf(ctx, 'M 1025 -15 L 583 -15 Q 489 48 557 113 L 635 179 Q 657 231 701 302 Q 753 368 682 454 Q 669 509 582 590 L 1025 590 Z', bank);
  shelf(ctx, 'M 470 240 Q 542 212 579 270 L 550 324 L 465 328 Q 418 295 470 240 Z', bank);
  shelf(ctx, 'M 433 473 Q 475 428 545 442 L 593 480 Q 507 520 444 506 Z', bank);
  const branches = 'M 508 -30 C 389 113 698 134 566 231 C 515 279 584 339 530 397 C 490 443 559 519 506 598 M 530 397 Q 427 374 366 522 L 305 590 M 530 397 Q 632 378 673 502 L 732 590';
  stream(ctx, branches, [[40, '#4eb9e43a'], [24, '#439ed65a'], [4, '#9bdff073'], [.8, '#def0eea5']]);
  contours(ctx, [[171, 140, 172, 137, 4], [840, 357, 162, 129, 7]], '#b1d5eb44', -.22);
}

function paintFire(ctx) {
  const rim = { upper: '#75483fe6', lower: '#342630', ridge: '#ec9c7a96', depth: 11 };
  shelf(ctx, 'M 500 33 Q 749 42 917 233 Q 1004 358 834 469 Q 722 573 498 546 Q 264 563 112 449 Q -11 345 78 219 Q 230 47 500 33 Z', rim);
  shelf(ctx, 'M 499 154 Q 683 180 716 295 Q 741 394 616 432 Q 476 483 348 410 Q 247 363 282 267 Q 321 184 499 154 Z',
    { upper: '#482933', lower: '#352232', ridge: '#c7836d86', depth: 14 });
  contours(ctx, [[496, 282, 366, 204, 2]], '#ecab7836', -.03);
  const lava = 'M 319 307 Q 357 298 369 335 L 455 355 L 487 310 L 545 299 L 563 369 L 666 351 L 702 302 M 455 355 L 430 424 L 461 463 L 444 569 M 563 369 L 598 447 L 558 574';
  stream(ctx, lava, [[34, '#e8564b34'], [17, '#df634873'], [5, '#fb8d60ba'], [1.2, '#ffdca4f0']]);
}

function paintMountain(ctx) {
  const rock = { upper: '#5b6b56eb', lower: '#2b3a33', ridge: '#c1d4a885', depth: 15 };
  shelf(ctx, 'M -45 430 L 96 297 L 169 289 L 220 197 L 281 215 L 376 126 L 429 155 L 563 69 L 671 78 L 769 -32 L 1045 -32 L 1045 172 L 918 180 L 868 276 L 766 303 L 707 391 L 633 372 L 552 478 L 455 458 L 371 535 L 242 496 L 123 608 L -45 608 Z', rock);
  contours(ctx, [[206, 301, 221, 77, 2], [461, 187, 245, 99, 5], [718, 148, 262, 89, 8], [654, 365, 250, 87, 3]], '#d3dbba54', -.48);
  stream(ctx, 'M 54 480 L 147 388 L 223 407 L 315 321 L 390 338 L 511 219 L 580 236 L 681 146 L 726 150 L 822 54 L 927 34', [[31, '#c2d2a716'], [3, '#e0e4be73']]);
  stream(ctx, 'M 619 129 L 681 146 L 703 118 L 733 138 L 769 96 M 465 259 L 511 219 L 525 247 L 559 253 M 198 422 L 223 407 L 247 429 L 292 393', [[1.5, '#eff3d4ac']]);
}

function paintMarsh(ctx) {
  const reeds = { upper: '#3b7268e9', lower: '#21433e', ridge: '#8dcbb0a0', depth: 7 };
  shelf(ctx, 'M -22 149 Q 101 62 241 87 Q 379 102 421 141 Q 308 167 276 222 Q 257 259 352 278 Q 250 299 244 341 Q 256 404 399 428 Q 274 472 159 477 Q 47 478 -22 420 Z', reeds);
  shelf(ctx, 'M 1022 138 Q 883 52 753 87 Q 622 108 580 148 Q 690 169 725 224 Q 747 255 651 278 Q 762 303 759 345 Q 742 408 601 431 Q 742 483 851 469 Q 965 466 1022 406 Z', reeds);
  shelf(ctx, 'M 429 103 Q 481 62 557 85 L 588 107 L 514 135 L 454 125 Z', reeds);
  shelf(ctx, 'M 417 494 Q 443 456 508 450 L 576 464 Q 553 502 476 518 Z', reeds);
  shelf(ctx, 'M 424 284 Q 452 242 501 235 Q 573 244 583 288 L 531 331 Q 448 339 424 284 Z', reeds);
  contours(ctx, [[500, 94, 128, 46, 5], [499, 473, 141, 53, 5], [502, 289, 156, 76, 5]], '#a0f0d544');
  stream(ctx, 'M 107 435 Q 186 510 369 480 T 604 524 Q 791 542 933 440 M 86 122 Q 233 42 359 83 T 636 57 Q 817 44 928 114', [[26, '#5ed2c017'], [1.5, '#8adacf70']]);
}

function paintClassic(ctx) {
  contours(ctx, [[140, 100, 144, 103, 4], [232, 408, 201, 121, 2], [823, 133, 186, 111, 5], [864, 461, 180, 114, 3]], '#a6c7d245');
  stream(ctx, 'M 455 -20 Q 407 68 463 145 T 479 246 Q 448 301 521 352 T 533 460 Q 514 515 588 592',
    [[37, '#0f233a'], [23, '#26494f'], [2, '#90b3bd72']]);
}

const painters = {
  sky: paintSky, earth: paintEarth, thunder: paintThunder, wind: paintWind,
  water: paintWater, fire: paintFire, mountain: paintMountain, marsh: paintMarsh,
};

export function drawTerrain(level) {
  const art = document.createElement('canvas');
  art.width = width;
  art.height = height;
  const ctx = art.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, width, height * .7);
  level.palette.forEach((color, index) => sky.addColorStop(index * .5, color));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  (painters[level.effect?.kind] || paintClassic)(ctx);

  ctx.beginPath();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#c4dbe714';
  for (let x = 20; x < width; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
  for (let y = 5; y < height; y += 40) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
  ctx.stroke();

  for (let index = 0; index < 920; index++) {
    const x = (index * 353.417) % width, y = (index * 279.691) % height;
    ctx.fillStyle = index % 4 ? '#deebe211' : '#030e1a42';
    ctx.fillRect(x, y, 1 + index % 2, 1);
  }
  const vignette = ctx.createRadialGradient(500, 275, 155, 500, 275, 595);
  vignette.addColorStop(0, '#101a2100');
  vignette.addColorStop(1, '#050f24a6');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#b5d0de3b';
  ctx.strokeRect(10.5, 10.5, width - 21, height - 21);
  if (level.direction) {
    const [x, y] = sector[level.direction];
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fillStyle = '#0b1527be';
    ctx.fill();
    ctx.strokeStyle = level.accent + 'b0';
    ctx.stroke();
    ctx.font = 'bold 18px "Segoe UI Symbol", sans-serif';
    ctx.fillStyle = level.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(level.symbol, x, y);
  }
  return art;
}
