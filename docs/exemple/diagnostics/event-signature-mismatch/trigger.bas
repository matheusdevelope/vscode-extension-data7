' @example: diagnostics/event-signature-mismatch/trigger
' @demonstrates: handler atribuído a OnClick (TNotifyEvent espera 1 parâmetro Sender) mas o handler tem 0
' @diagnostics: event-signature-mismatch@11
'
Imports Forms

Namespace mod_consumer
   Class TConsumer
      Public f As Form
      Public Sub Setup()
         Me.f.OnClick = AddressOf NoArgsHandler
      End Sub
      Public Sub NoArgsHandler()
      End Sub
   End Class
End Namespace
