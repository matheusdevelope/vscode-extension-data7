' @example: diagnostics/lambda-signature-mismatch/trigger
' @demonstrates: lambda with more parameters than the delegate accepts
' @diagnostics: lambda-signature-mismatch@15
'
Namespace mod_lambda_signature
   Delegate Function TPredicate(value As String, i As Integer) As Boolean
   Class Runner
      Inherits TObject

      Sub New()
         MyBase.New()
      End Sub

      Sub Run(handler As TPredicate)
         Me.Run(Function(value As String, i As Integer, extra As Variant) True)
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
