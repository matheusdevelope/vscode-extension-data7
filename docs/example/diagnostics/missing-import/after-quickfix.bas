' @example: diagnostics/missing-import/after-quickfix
' @demonstrates: resultado de aplicar o Quick Fix "Importar mod_resources" sobre diagnostics/missing-import/trigger
' @diagnostics: none
'
Imports mod_resources

Namespace mod_consumer
   Class TConsumer
      Public Sub Run()
         Dim loader As TResourceLoader
      End Sub
   End Class
End Namespace
