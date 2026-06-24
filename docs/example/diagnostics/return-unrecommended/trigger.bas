' @example: diagnostics/return-unrecommended/trigger
' @demonstrates: uso de Return em função onde a forma preferida é atribuição ao nome da rotina
' @diagnostics: return-unrecommended@4
'
Namespace mod_test
   Class Test
      Public Function Calc(a As Integer) As Integer
         Return a + 1
      End Function
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
