' @example: diagnostics/destructure-unknown-member/trigger
' @demonstrates: destructure faz referência a membro inexistente
' @diagnostics: destructure-unknown-member@6
' @requires: classe TPessoa que NÃO tem campo Endereco no workspace
'
Namespace mod_demo
   Sub Run(pPessoa As TPessoa)
      Dim { Nome, Endereco } = pPessoa
   End Sub
End Namespace
