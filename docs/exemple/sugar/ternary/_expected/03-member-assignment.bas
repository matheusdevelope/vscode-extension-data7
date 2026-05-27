' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/ternary/03-member-assignment. O target pode ser uma cadeia
' `obj.prop` — ambas as atribuições no If/Else preservam o mesmo target.
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
