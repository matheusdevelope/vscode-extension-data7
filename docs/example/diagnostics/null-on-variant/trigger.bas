' @example: diagnostics/null-on-variant/trigger
' @demonstrates: Variant não aceita NULL (atribuição nem comparação)
' @diagnostics: null-on-variant@8, null-on-variant@12
'
Namespace mod_exemplo
   Class C
      Function IsEmptyValue(pValue As Variant) As Boolean
         If pValue = Null Then
            IsEmptyValue = True
            Exit Function
         End If
         pValue = Null
         IsEmptyValue = False
      End Function
   End Class
End Namespace
