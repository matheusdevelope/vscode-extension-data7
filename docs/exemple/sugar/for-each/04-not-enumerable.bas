' @example: sugar/for-each/04-not-enumerable
' @demonstrates: For Each sobre tipo sem propriedade Count + indexer — emite not-enumerable e Builder mantém a linha intacta
' @diagnostics: not-enumerable@12
'
Namespace mod_demo
   Class TNotIterable
      Public foo As String
   End Class
   Class TDemo
      Public Sub Run()
         Dim x As TNotIterable
         For Each item In x
            ' o Builder vai deixar esta linha sem transpilar e o executor falhará em runtime
         Next
      End Sub
   End Class
End Namespace
