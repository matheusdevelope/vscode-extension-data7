' @example: diagnostics/namespace-name-conflict/trigger
' @demonstrates: classe com o mesmo nome do namespace que a contém
' @diagnostics: namespace-name-conflict@2
'

Namespace ControleTitulos
   Class ControleTitulos
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
