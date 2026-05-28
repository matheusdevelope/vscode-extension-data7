' @example: diagnostics/destructure-too-deep/trigger
' @demonstrates: destructure aninhado profundamente — não suportado pelo parser line-based
' @diagnostics: destructure-too-deep@6
' @requires: emissão futura do linter quando o parser de destructure detectar aninhamento profundo
'
Namespace mod_demo
   Sub Run(pPessoa As TPessoa)
      Dim { Endereco: { Cidade: { Bairro } } } = pPessoa
   End Sub
End Namespace
