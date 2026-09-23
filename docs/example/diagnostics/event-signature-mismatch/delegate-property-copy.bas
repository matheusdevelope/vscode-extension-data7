' @example: diagnostics/event-signature-mismatch/delegate-property-copy
' @demonstrates: copiar OnChange de um controle para um campo TNotifyEvent não é atribuição de handler (não usar Ambient.OnChange de 3 params)
' @diagnostics: none
'
Imports Forms

Namespace mod_editors
   Class TLabeledEditor
      Public edit As TextBox
      Protected _nativeOnChange As TNotifyEvent
      Public Sub Bind()
         me._nativeOnChange = me.edit.OnChange
         me.edit.OnChange = me._handleChange
      End Sub
      Private Sub _handleChange(pSender As TObject)
      End Sub
   End Class
End Namespace
