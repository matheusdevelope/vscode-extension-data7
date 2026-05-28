' @example: diagnostics/using-non-disposable/trigger
' @demonstrates: Using sobre tipo sem Free na cadeia — Builder gera .Free() mesmo assim
' @diagnostics: using-non-disposable@5
' @requires: classe TNotDisposable sem Free no workspace
'
Namespace mod_demo
   Sub Run()
      Using x As New TNotDisposable()
      End Using
   End Sub
End Namespace
