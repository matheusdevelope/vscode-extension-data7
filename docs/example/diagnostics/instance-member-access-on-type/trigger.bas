' @example: diagnostics/instance-member-access-on-type/trigger
' @demonstrates: access to an instance member statically on the type
' @diagnostics: instance-member-access-on-type@20
' @requires: o código diagnóstico existe, mas o linter live atual resolve identificadores de classe como tipos antes de marcar acesso estático; pendente wiring do checker
'
Imports Forms

Namespace mod_test
   Class C
      Inherits TObject

      Public Sub New()
         MyBase.New()
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

      Public Sub Run()
         Dim caption As String = TForm.Caption
      End Sub
   End Class
End Namespace
