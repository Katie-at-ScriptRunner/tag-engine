import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { StreamLanguage } from '@codemirror/language'
import { javascript as cmJavascript } from '@codemirror/lang-javascript'
import { python as cmPython } from '@codemirror/lang-python'
import { java as cmJava } from '@codemirror/lang-java'
import { sql as cmSql } from '@codemirror/lang-sql'
import { xml as cmXml } from '@codemirror/lang-xml'
import { html as cmHtml } from '@codemirror/lang-html'
import { json as cmJson } from '@codemirror/lang-json'
import { yaml as cmYaml } from '@codemirror/lang-yaml'
import { css as cmCss } from '@codemirror/lang-css'
import { php as cmPhp } from '@codemirror/lang-php'
import { rust as cmRust } from '@codemirror/lang-rust'
import { cpp as cmCpp } from '@codemirror/lang-cpp'
import { groovy as cmGroovy } from '@codemirror/legacy-modes/mode/groovy'
import { ruby as cmRuby } from '@codemirror/legacy-modes/mode/ruby'
import { go as cmGo } from '@codemirror/legacy-modes/mode/go'
import { r as cmR } from '@codemirror/legacy-modes/mode/r'
import { shell as cmShell } from '@codemirror/legacy-modes/mode/shell'
import { swift as cmSwift } from '@codemirror/legacy-modes/mode/swift'
import { kotlin as cmKotlin, csharp as cmCsharp, scala as cmScala } from '@codemirror/legacy-modes/mode/clike'
import { atomone as cmTheme } from '@uiw/codemirror-theme-atomone'

// Language mapping kept in step with the hljs registrations in App.tsx, so
// the read-only view (highlight.js) and this editor (CodeMirror) colour the
// same artifact.lang the same way.
function getLangExtension(lang: string) {
  switch (lang.toLowerCase()) {
    case 'javascript': case 'js': return cmJavascript()
    case 'typescript': case 'ts': return cmJavascript({ typescript: true })
    case 'python': case 'py': return cmPython()
    case 'java': return cmJava()
    case 'sql': return cmSql()
    case 'xml': return cmXml()
    case 'html': return cmHtml()
    case 'json': return cmJson()
    case 'yaml': case 'yml': return cmYaml()
    case 'css': return cmCss()
    case 'php': return cmPhp()
    case 'rust': return cmRust()
    case 'c': case 'cpp': return cmCpp()
    case 'groovy': return StreamLanguage.define(cmGroovy)
    case 'ruby': case 'rb': return StreamLanguage.define(cmRuby)
    case 'go': return StreamLanguage.define(cmGo)
    case 'r': return StreamLanguage.define(cmR)
    case 'bash': case 'sh': return StreamLanguage.define(cmShell)
    case 'swift': return StreamLanguage.define(cmSwift)
    case 'kotlin': case 'kt': return StreamLanguage.define(cmKotlin)
    case 'csharp': case 'cs': return StreamLanguage.define(cmCsharp)
    case 'scala': return StreamLanguage.define(cmScala)
    default: return []
  }
}

export default function CodeEditor({ code, lang, onChange }: { code: string; lang: string; onChange: (v: string) => void }) {
  const extensions = useMemo(() => [getLangExtension(lang)], [lang])
  return (
    <CodeMirror
      value={code}
      onChange={onChange}
      theme={cmTheme}
      height="100%"
      className="code-editor-flex"
      extensions={extensions}
      basicSetup={{ lineNumbers: true, foldGutter: false }}
      style={{ fontSize: '.8rem' }}
    />
  )
}
