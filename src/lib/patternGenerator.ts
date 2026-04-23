export interface Measurements {
  chest: number;
  shoulder: number;
  sleeveLength: number;
  shirtLength: number;
  neck: number;
}

export interface PatternPiece {
  label: string;
  width: number;
  height: number;
  paths: string;
  annotations: { x: number; y: number; text: string }[];
}

export interface PatternData {
  pieces: PatternPiece[];
  derived: {
    frontWidth: number;
    backWidth: number;
    armholeDepth: number;
    sleeveWidth: number;
  };
}

const MM_PER_CM = 10; // 1cm = 10 SVG units (so 1 unit = 1mm)

export function generatePattern(m: Measurements): PatternData {
  const frontWidth = m.chest / 4 + 5;
  const backWidth = m.chest / 4 + 5;
  const armholeDepth = m.chest / 6 + 7;
  const sleeveWidth = armholeDepth * 2;

  const neckWidth = m.neck / 5;
  const neckDepthFront = m.neck / 5 + 1.5;
  const neckDepthBack = 2.5;
  const shoulderHalf = m.shoulder / 2;

  // FRONT PIECE
  const fW = frontWidth * MM_PER_CM;
  const fH = m.shirtLength * MM_PER_CM;
  const fNeckW = neckWidth * MM_PER_CM;
  const fNeckD = neckDepthFront * MM_PER_CM;
  const fShoulder = shoulderHalf * MM_PER_CM;
  const fArmhole = armholeDepth * MM_PER_CM;

  const frontPath = `
    M 0 ${fNeckD}
    Q ${fNeckW / 2} 0 ${fNeckW} 0
    L ${fShoulder} ${fNeckD * 0.4}
    Q ${fShoulder + (fW - fShoulder) / 2} ${fArmhole / 2} ${fW} ${fArmhole}
    L ${fW} ${fH}
    L 0 ${fH}
    Z
  `.trim();

  // BACK PIECE
  const bNeckD = neckDepthBack * MM_PER_CM;
  const backPath = `
    M 0 ${bNeckD}
    Q ${fNeckW / 2} 0 ${fNeckW} 0
    L ${fShoulder} ${bNeckD * 1.2}
    Q ${fShoulder + (fW - fShoulder) / 2} ${fArmhole / 2} ${fW} ${fArmhole}
    L ${fW} ${fH}
    L 0 ${fH}
    Z
  `.trim();

  // SLEEVE PIECE
  const sW = sleeveWidth * MM_PER_CM;
  const sL = m.sleeveLength * MM_PER_CM;
  const cuffInset = sW * 0.12;
  const capHeight = fArmhole * 0.55;

  const sleevePath = `
    M 0 ${capHeight}
    Q ${sW / 4} 0 ${sW / 2} 0
    Q ${(3 * sW) / 4} 0 ${sW} ${capHeight}
    L ${sW - cuffInset} ${sL}
    L ${cuffInset} ${sL}
    Z
  `.trim();

  return {
    derived: { frontWidth, backWidth, armholeDepth, sleeveWidth },
    pieces: [
      {
        label: "FRONT",
        width: fW,
        height: fH,
        paths: frontPath,
        annotations: [
          { x: fW / 2, y: fH / 2, text: "FRONT" },
          { x: fW / 2, y: fH / 2 + 30, text: `${frontWidth.toFixed(1)} × ${m.shirtLength} cm` },
          { x: fW / 2, y: fH / 2 + 55, text: "Cut 1 on fold" },
        ],
      },
      {
        label: "BACK",
        width: fW,
        height: fH,
        paths: backPath,
        annotations: [
          { x: fW / 2, y: fH / 2, text: "BACK" },
          { x: fW / 2, y: fH / 2 + 30, text: `${backWidth.toFixed(1)} × ${m.shirtLength} cm` },
          { x: fW / 2, y: fH / 2 + 55, text: "Cut 1 on fold" },
        ],
      },
      {
        label: "SLEEVE",
        width: sW,
        height: sL,
        paths: sleevePath,
        annotations: [
          { x: sW / 2, y: sL / 2, text: "SLEEVE" },
          { x: sW / 2, y: sL / 2 + 30, text: `${sleeveWidth.toFixed(1)} × ${m.sleeveLength} cm` },
          { x: sW / 2, y: sL / 2 + 55, text: "Cut 2" },
        ],
      },
    ],
  };
}

export function buildSvgString(data: PatternData, opts?: { darkText?: boolean }): string {
  const PAD = 40;
  const GAP = 50;
  const totalWidth = data.pieces.reduce((s, p) => s + p.width, 0) + GAP * (data.pieces.length - 1) + PAD * 2;
  const maxHeight = Math.max(...data.pieces.map((p) => p.height)) + PAD * 2 + 40;

  const stroke = opts?.darkText ? "#0f172a" : "#0f172a";
  const labelFill = "#0f172a";
  const bg = "#ffffff";

  let x = PAD;
  const piecesSvg = data.pieces
    .map((p) => {
      const groupX = x;
      x += p.width + GAP;
      const annotations = p.annotations
        .map(
          (a, i) =>
            `<text x="${a.x}" y="${a.y}" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${
              i === 0 ? 28 : 16
            }" font-weight="${i === 0 ? 700 : 400}" fill="${labelFill}">${a.text}</text>`
        )
        .join("");
      return `
        <g transform="translate(${groupX}, ${PAD})">
          <path d="${p.paths}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" />
          ${annotations}
        </g>
      `;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${maxHeight}" width="100%" preserveAspectRatio="xMidYMid meet">
    <rect width="100%" height="100%" fill="${bg}" />
    <defs>
      <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
        <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" stroke-width="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)" opacity="0.5" />
    ${piecesSvg}
  </svg>`;
}
