import { HugeiconsIcon } from '@hugeicons/react';
import BrowserIcon from '@hugeicons/core-free-icons/BrowserIcon';
import CProgrammingIcon from '@hugeicons/core-free-icons/CProgrammingIcon';
import CodeIcon from '@hugeicons/core-free-icons/CodeIcon';
import CppIcon from '@hugeicons/core-free-icons/CppIcon';
import Css3Icon from '@hugeicons/core-free-icons/Css3Icon';
import Html5Icon from '@hugeicons/core-free-icons/Html5Icon';
import JavaIcon from '@hugeicons/core-free-icons/JavaIcon';
import JavaScriptIcon from '@hugeicons/core-free-icons/JavaScriptIcon';
import PythonIcon from '@hugeicons/core-free-icons/PythonIcon';
import SqlIcon from '@hugeicons/core-free-icons/SqlIcon';

const LANGUAGE_ICONS = {
  python: PythonIcon,
  c: CProgrammingIcon,
  cpp: CppIcon,
  java: JavaIcon,
  javascript: JavaScriptIcon,
  sql: SqlIcon,
  web: BrowserIcon,
  html: Html5Icon,
  css: Css3Icon,
};

export default function CodeMatrixLanguageTick({ x = 0, y = 0, payload, languages = [] }) {
  const language = languages.find((item) => item.label === payload?.value);
  const name = language?.label || payload?.value || 'Other language';
  const icon = LANGUAGE_ICONS[language?.id] || CodeIcon;

  return <g className="cmxi-language-axis-icon" transform={`translate(${x}, ${y})`} role="img" aria-label={name}>
    <title>{name}</title>
    <HugeiconsIcon icon={icon} x={-11} y={7} size={22} strokeWidth={1.7} aria-hidden="true" focusable="false" />
  </g>;
}
