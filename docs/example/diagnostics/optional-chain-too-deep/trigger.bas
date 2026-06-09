' @example: diagnostics/optional-chain-too-deep/trigger
' @demonstrates: cadeia ?. com mais de 3 níveis — refator manual exigido
' @diagnostics: optional-chain-too-deep@6
' @requires: o diagnóstico é emitido pelo SugarTranspiler em build-time (ainda não wired ao linter live)
'
Namespace mod_demo
   Sub Run(pObj As TPessoa)
      Dim n = pObj?.A?.B?.C?.D?.E
   End Sub
End Namespace
