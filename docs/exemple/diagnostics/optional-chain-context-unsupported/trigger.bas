' @example: diagnostics/optional-chain-context-unsupported/trigger
' @demonstrates: ?. usado fora de assignment ou call-statement
' @diagnostics: optional-chain-context-unsupported@6
' @requires: o diagnóstico é emitido pelo SugarTranspiler em build-time (ainda não wired ao linter live)
'
Namespace mod_demo
   Sub Run(pObj As TPessoa)
      Print pObj?.Nome
   End Sub
End Namespace
