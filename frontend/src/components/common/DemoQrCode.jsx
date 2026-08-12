import { useMemo } from "react";

function hashText(value) {
  let hash = 2166136261;
  for (const character of String(value ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function inFinder(row, column, top, left) {
  const localRow = row - top;
  const localColumn = column - left;
  if (localRow < 0 || localColumn < 0 || localRow > 6 || localColumn > 6) {
    return null;
  }

  const edge =
    localRow === 0 || localColumn === 0 || localRow === 6 || localColumn === 6;
  const center =
    localRow >= 2 && localRow <= 4 && localColumn >= 2 && localColumn <= 4;
  return edge || center;
}

export default function DemoQrCode({ value, size = 210 }) {
  const cells = useMemo(() => {
    const dimension = 25;
    const seed = hashText(value);
    const result = [];

    for (let row = 0; row < dimension; row += 1) {
      for (let column = 0; column < dimension; column += 1) {
        const finder =
          inFinder(row, column, 1, 1) ??
          inFinder(row, column, 1, dimension - 8) ??
          inFinder(row, column, dimension - 8, 1);

        const mixed =
          Math.imul(seed ^ (row * 374761393), 668265263) ^
          Math.imul(column + 1, 2246822519);
        const filled = finder ?? ((mixed >>> ((row + column) % 24)) & 1) === 1;

        result.push({ row, column, filled });
      }
    }

    return result;
  }, [value]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 25 25"
      role="img"
      aria-label="Mã QR thanh toán demo"
      shapeRendering="crispEdges"
    >
      <rect width="25" height="25" fill="white" />
      {cells
        .filter((cell) => cell.filled)
        .map((cell) => (
          <rect
            key={`${cell.row}-${cell.column}`}
            x={cell.column}
            y={cell.row}
            width="1"
            height="1"
            fill="#111827"
          />
        ))}
    </svg>
  );
}
