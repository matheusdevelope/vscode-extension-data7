' @example: diagnostics/null-coalesce-context-unsupported/trigger
' @demonstrates: ?? usado fora de assignment RHS — Print não é assignment
' @diagnostics: null-coalesce-context-unsupported@6
' @requires: o diagnóstico é emitido pelo SugarTranspiler em build-time (ainda não wired ao linter live)
'
Namespace mod_demo
   Sub Run(pNome As String)
      Print pNome ?? "(anônimo)"
   End Sub
End Namespace
