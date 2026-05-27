' @example: diagnostics/unused-import/trigger
' @demonstrates: diretiva Imports declarada mas nenhum símbolo do namespace é referenciado
' @diagnostics: unused-import@5
'
Imports Forms

Namespace mod_consumer
   Class TConsumer
      Public Sub Run()
         Dim s As String
      End Sub
   End Class
End Namespace
