' @example: sugar/spread-collection/01-basic
' @demonstrates: convenção atual de inicialização de StringList por Add manual
' @diagnostics: none
'
' O `From { 1, ...other, 3 }` literal ainda não é transpilado. A
' convenção atual é Add manual:
'
Imports Collections

Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim list As New StringList
         list.Add("Coca-cola")
         list.Add("Pepsi")
         list.Add("Fanta")
      End Sub
   End Class
End Namespace
