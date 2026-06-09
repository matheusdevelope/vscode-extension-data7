' @example: diagnostics/missing-import/trigger
' @demonstrates: tipo de outro módulo do workspace usado sem o Imports correspondente
' @diagnostics: missing-import@9
' @requires: módulo "mod_resources" exportando "TResourceLoader" no workspace
'
Namespace mod_consumer
   Class TConsumer
      Public Sub Run()
         Dim loader As TResourceLoader
      End Sub
   End Class
End Namespace
