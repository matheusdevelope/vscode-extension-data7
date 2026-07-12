' @example: diagnostics/incomplete-property-body/trigger
' @demonstrates: Property declarada sem bloco Get/Set e End Property
' @diagnostics: incomplete-property-body@7

Namespace mod_incomplete_property
   Class Exemplo
      Property Nome As String

      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
