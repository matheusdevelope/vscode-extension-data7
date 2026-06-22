' @example: diagnostics/finally-block-unsupported/trigger
' @demonstrates: O uso de Finally no Try-Catch é desencorajado
' @diagnostics: finally-block-unsupported@7
'
Namespace mod_demo
   Sub Run()
      Try
         Print("Try")
      Catch ex As Exception
         Print(ex.Message)
      Finally
         Print("Finally")
      End Try
   End Sub
End Namespace
