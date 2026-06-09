' @example: diagnostics/not-enumerable/trigger
' @demonstrates: For Each sobre tipo do workspace sem propriedade Count + indexer inteiro
' @diagnostics: not-enumerable@12
'
Namespace mod_consumer
   Class TNotIterable
      Public foo As String
   End Class
   Class TConsumer
      Public Sub Run()
         Dim x As TNotIterable
         For Each item In x
         Next
      End Sub
   End Class
End Namespace
