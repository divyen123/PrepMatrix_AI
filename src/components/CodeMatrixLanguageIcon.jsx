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

export default function CodeMatrixLanguageIcon({ language, size = 22, ...props }) {
  const icon = Object.hasOwn(LANGUAGE_ICONS, language) ? LANGUAGE_ICONS[language] : CodeIcon;
  return <HugeiconsIcon {...props} icon={icon} size={size} strokeWidth={1.7} />;
}
