' @example: diagnostics/ternary-context-unsupported/trigger
' @demonstrates: ternário em contexto não-assignment (Print) — não é expansível
' @diagnostics: ternary-context-unsupported@8
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(ok As Boolean)
         Print ok ? "sim" : "nao"
      End Sub
   End Class
End Namespace
