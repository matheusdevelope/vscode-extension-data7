' @example: sugar/using/_expected/01-simple
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/using/01-simple
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim form As TFormCard = New TFormCard("Processar")
         Try
            form.Show()
         Catch
         Finally
            form.Free()
         End Try
      End Sub
   End Class
End Namespace
