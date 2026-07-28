' @example: diagnostics/return-unrecommended/equality-comparison
' @demonstrates: Return com comparação (=) deve preservar a expressão completa no quick fix
' @diagnostics: return-unrecommended@4
'
Namespace mod_test
   Class Options
   End Class

   Class Test
      Private _rdbms As Options

      Public Function Equal(pOption As Options) As Boolean
         Return me._rdbms = pOption
      End Function

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
