' @example: sugar/using/01-simple
' @demonstrates: Using ... End Using expandido para Try/Finally/x.Free()
' @diagnostics: none
' @transpiled-to: sugar/using/_expected/01-simple.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Using form As New TFormCard("Processar")
            form.Show()
         End Using
      End Sub
   End Class
End Namespace
