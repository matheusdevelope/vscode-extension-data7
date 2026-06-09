' @example: sugar/destructure-object/02-rename-default
' @demonstrates: destructuring com rename (As n) e default (= "x")
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(pessoa As TPessoa)
         Dim { Nome As nome, Idade As idade = 0 } = pessoa
         Print nome & " " & idade
      End Sub
   End Class
End Namespace
