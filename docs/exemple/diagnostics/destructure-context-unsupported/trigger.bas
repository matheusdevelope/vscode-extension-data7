' @example: diagnostics/destructure-context-unsupported/trigger
' @demonstrates: destructure fora de Dim/parâmetro — não suportado
' @diagnostics: destructure-context-unsupported@6
' @requires: emissão futura do linter quando destructure for detectado em contexto não-Dim
'
Namespace mod_demo
   Sub Run(pPessoa As TPessoa)
      Print { Nome, Idade } = pPessoa
   End Sub
End Namespace
