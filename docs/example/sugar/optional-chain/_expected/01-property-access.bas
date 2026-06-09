' @example: sugar/optional-chain/_expected/01-property-access
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/optional-chain/01-property-access
' @diagnostics: none
'
Imports mod_logger
Namespace mod_demo
   Class TDemo
      Public Sub Run(pObj As TPessoa)
         Dim nome As String
         If pObj <> NULL Then
            nome = pObj.Nome
         End If
         mod_logger.Printe(nome)
      End Sub
   End Class
End Namespace
