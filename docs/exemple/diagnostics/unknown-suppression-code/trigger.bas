' @example: diagnostics/unknown-suppression-code/trigger
' @demonstrates: diretiva data7:disable-line referenciando código inexistente em DiagnosticCodes
' @diagnostics: unknown-suppression-code@7
'
Namespace mod_consumer
   Class TConsumer
      Public foo As Integer ' data7:disable-line missig-import
   End Class
End Namespace
