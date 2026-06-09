' @example: sugar/object-init/01-basic
' @demonstrates: New T() With { .X = v, .Y = w } expandido para With block
' @diagnostics: none
' @transpiled-to: sugar/object-init/_expected/01-basic.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim p As TPessoa = New TPessoa() With { .Nome = "Joao", .Idade = 30 }
      End Sub
   End Class
End Namespace
