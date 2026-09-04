' @example: diagnostics/qualified-private-shared-access/trigger
' @demonstrates: Private Shared não pode ser acessado com o nome da classe
' @diagnostics: qualified-private-shared-access@13, qualified-private-shared-access@14, qualified-private-shared-access@18
'
Namespace mod_exemplo
   Class TTable
      Private Shared _tplReady As Boolean
      Private Shared _tplCount As Integer
      Shared Function IsReady() As Boolean
         IsReady = _tplReady
      End Function
      Shared Sub EnsureTplCache()
         If Not TTable._tplReady Then
            TTable._tplCount = 0
            _tplReady = True
         End If
         If TTable.IsReady() Then
            TTable.ResetTpl()
         End If
      End Sub
      Private Shared Sub ResetTpl()
         _tplCount = 0
      End Sub
   End Class
End Namespace
