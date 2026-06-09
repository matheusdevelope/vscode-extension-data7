' @example: sugar/ternary/_expected/03-member-assignment
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/ternary/03-member-assignment
' @diagnostics: none
'
Imports Forms
Namespace mod_demo
   Class TDemo
      Public Sub Configurar(form As Form, modal As Boolean)
         If modal Then
            form.Caption = "Modal"
         Else
            form.Caption = "Standard"
         End If
      End Sub
   End Class
End Namespace
