' @example: sugar/object-init/_expected/01-basic
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/object-init/01-basic
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim p As TPessoa = New TPessoa()
         With p
            .Nome = "Joao"
            .Idade = 30
         End With
      End Sub
   End Class
End Namespace
