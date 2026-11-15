export interface LineChartPoint {
  id: string;
  /** Instante do ponto (ISO); posiciona o ponto no eixo do tempo. */
  at: string;
  value: number;
  /** Rótulo curto do eixo e da tabela (ex.: "11/11/2026"). */
  dateLabel: string;
  /** Valor formatado, com unidade, para o rótulo do ponto e a tabela. */
  valueLabel: string;
}

export interface LineChartProps {
  /** Nome do gráfico para leitores de tela (ex.: "Evolução de Peso"). */
  label: string;
  points: readonly LineChartPoint[];
  /** Faixa normal desenhada ao fundo (opcional). */
  band?: { min: number; max: number } | null;
  /** Texto da legenda da faixa (ex.: "Faixa normal: 56–75,7"). */
  bandLabel?: string;
  /** Cabeçalho da coluna de valores da tabela. */
  valueHeader: string;
  formatAxis: (value: number) => string;
}

const WIDTH = 320;
const HEIGHT = 190;
const PAD = { left: 40, right: 20, top: 26, bottom: 30 };

/** Quais pontos levam rótulo: todos até 6; acima disso, só o primeiro, o último e os extremos. */
export function labeledIndexes(values: readonly number[]): Set<number> {
  if (values.length <= 6) return new Set(values.map((_, index) => index));
  const lowest = values.indexOf(Math.min(...values));
  const highest = values.indexOf(Math.max(...values));
  return new Set([0, values.length - 1, lowest, highest]);
}

/**
 * Gráfico de linha em SVG próprio (#198): linha, faixa normal ao fundo e pontos rotulados. A tabela abaixo traz os
 * mesmos valores e é a alternativa acessível; o SVG é descrito por `label`. A linha se desenha com animação só quando
 * o usuário não pede movimento reduzido (CSS).
 */
export function LineChart({
  label,
  points,
  band,
  bandLabel,
  valueHeader,
  formatAxis,
}: LineChartProps) {
  const values = points.map((point) => point.value);
  const bounds = [...values, ...(band ? [band.min, band.max] : [])];
  let min = Math.min(...bounds);
  let max = Math.max(...bounds);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const margin = (max - min) * 0.08;
  min -= margin;
  max += margin;

  const times = points.map((point) => new Date(point.at).getTime());
  const first = Math.min(...times);
  const last = Math.max(...times);
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (time: number) =>
    last === first
      ? PAD.left + innerWidth / 2
      : PAD.left + ((time - first) / (last - first)) * innerWidth;
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * innerHeight;

  const coords = points.map((point, index) => ({ point, cx: x(times[index]), cy: y(point.value) }));
  const path = coords
    .map(({ cx, cy }, index) => `${index === 0 ? "M" : "L"}${cx.toFixed(1)} ${cy.toFixed(1)}`)
    .join(" ");
  const labeled = labeledIndexes(values);
  const lastIndex = coords.length - 1;

  return (
    <figure className="fb-linechart">
      <svg
        className="fb-linechart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${label}: ${points.length} ${points.length === 1 ? "ponto" : "pontos"}, de ${points[0]?.valueLabel} a ${points[lastIndex]?.valueLabel}. Os valores estão na tabela abaixo.`}
      >
        {band && (
          <rect
            className="fb-linechart__band"
            x={PAD.left}
            width={innerWidth}
            y={y(Math.min(band.max, max))}
            height={Math.max(0, y(Math.max(band.min, min)) - y(Math.min(band.max, max)))}
          />
        )}
        <line
          className="fb-linechart__axis"
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={HEIGHT - PAD.bottom}
          y2={HEIGHT - PAD.bottom}
        />
        <text className="fb-linechart__tick" x={PAD.left - 6} y={y(max) + 4} textAnchor="end">
          {formatAxis(max)}
        </text>
        <text className="fb-linechart__tick" x={PAD.left - 6} y={y(min) + 4} textAnchor="end">
          {formatAxis(min)}
        </text>
        {coords.length > 1 && (
          <path className="fb-linechart__line" d={path} pathLength={1} fill="none" />
        )}
        {coords.map(({ point, cx, cy }, index) => (
          <g key={point.id}>
            <circle className="fb-linechart__point" cx={cx} cy={cy} r={4}>
              <title>{`${point.dateLabel}: ${point.valueLabel}`}</title>
            </circle>
            {labeled.has(index) && (
              <text className="fb-linechart__value" x={cx} y={cy - 9} textAnchor="middle">
                {point.valueLabel}
              </text>
            )}
          </g>
        ))}
        <text
          className="fb-linechart__tick"
          x={coords[0]?.cx}
          y={HEIGHT - 10}
          textAnchor={coords.length > 1 ? "start" : "middle"}
        >
          {points[0]?.dateLabel}
        </text>
        {coords.length > 1 && (
          <text
            className="fb-linechart__tick"
            x={coords[lastIndex].cx}
            y={HEIGHT - 10}
            textAnchor="end"
          >
            {points[lastIndex].dateLabel}
          </text>
        )}
      </svg>
      {band && bandLabel && (
        <figcaption className="fb-linechart__legend">
          <i className="fb-linechart__swatch" aria-hidden="true" /> {bandLabel}
        </figcaption>
      )}
      <table className="fb-linechart__table">
        <caption className="fb-ui-sr-only">{label}: valores por data</caption>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((point) => (
            <tr key={point.id}>
              <td>{point.dateLabel}</td>
              <td>{point.valueLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
