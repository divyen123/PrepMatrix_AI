import CodeMatrixLanguageIcon from './CodeMatrixLanguageIcon';

export default function CodeMatrixLanguageTick({ x = 0, y = 0, payload, languages = [] }) {
  const language = languages.find((item) => item.label === payload?.value);
  const name = language?.label || payload?.value || 'Other language';

  return <g className="cmxi-language-axis-icon" transform={`translate(${x}, ${y})`} role="img" aria-label={name}>
    <title>{name}</title>
    <CodeMatrixLanguageIcon language={language?.id} x={-11} y={7} size={22} aria-hidden="true" focusable="false" />
  </g>;
}
