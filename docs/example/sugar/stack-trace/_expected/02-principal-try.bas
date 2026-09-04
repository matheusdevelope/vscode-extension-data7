' @example: sugar/stack-trace/02-principal-try
' @demonstrates: Principal.bas encapsula o conteúdo após Imports em Try/Catch/Finally; o Catch relança após Report e Clean
' @diagnostics: none
'
Imports Collections
Try
   Dim _form As String = "ok"
   Print(_form)
Catch ex As Exception
   mod_logger.Printe(StackTrace.Report(ex))
   StackTrace.Clean()
   Throw
Finally
   StackTrace.Clean()
End Try
