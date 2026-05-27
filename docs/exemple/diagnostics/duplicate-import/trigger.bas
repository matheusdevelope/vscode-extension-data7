' @example: diagnostics/duplicate-import/trigger
' @demonstrates: o mesmo Imports declarado duas vezes no cabeçalho do arquivo
' @diagnostics: duplicate-import@7
'
Imports Forms
Imports Collections
Imports Forms

Namespace mod_consumer
   Class TConsumer
      Public Sub Run()
         Dim f As Form
         Dim s As StringList
      End Sub
   End Class
End Namespace
