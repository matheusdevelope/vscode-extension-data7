' @example: sugar/ternary/03-member-assignment
' @demonstrates: ternário atribuindo a `obj.prop` — funciona como reassignment
' @diagnostics: none
' @transpiled-to: sugar/ternary/_expected/03-member-assignment.bas
'
Imports Forms

Namespace mod_demo
   Class TDemo
      Public Sub Configurar(form As Form, modal As Boolean)
         form.Caption = modal ? "Modal" : "Standard"
      End Sub
   End Class
End Namespace
