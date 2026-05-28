' @example: sugar/destructure-object/01-basic
' @demonstrates: Dim { Nome, Idade } = pessoa expandido em Dims individuais
' @diagnostics: none
' @transpiled-to: sugar/destructure-object/_expected/01-basic.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(pessoa As TPessoa)
         Dim { Nome, Idade } = pessoa
         Print Nome & " " & Idade
      End Sub
   End Class
End Namespace
