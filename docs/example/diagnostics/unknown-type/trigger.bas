' @example: diagnostics/unknown-type/trigger
' @demonstrates: referência a tipo que não existe no workspace ou na biblioteca do sistema
' @diagnostics: unknown-type@8
'
Namespace mod_consumer
   Class TConsumer
      Public Sub Run()
         Dim x As TipoNaoExiste
      End Sub
   End Class
End Namespace
