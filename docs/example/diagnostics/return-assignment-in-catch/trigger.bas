' @example: diagnostics/return-assignment-in-catch/trigger
' @demonstrates: retorno por atribuicao dentro de Catch rejeitado pelo compilador nativo
' @diagnostics: return-assignment-in-catch@11
'
Namespace mod_test
   Class C
      Function Calc() As Integer
         Try
            Calc = 1
         Catch ex As Exception
            Calc = 2
         End Try
      End Function
   End Class
End Namespace
