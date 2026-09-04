' @example: diagnostics/namespace-shadow/trigger
' @demonstrates: Dim sql sombreia o namespace SQL; o compilador deixa de resolver SQL.Command
' @diagnostics: namespace-shadow@8
'
Namespace mod_exemplo
   Class TDemo
      Function ExistsByPk() As Boolean
         Dim sql As String = "SELECT 1"
         Dim cmd As SQL.Command = New SQL.Command()
         ExistsByPk = True
      End Function
   End Class
End Namespace
