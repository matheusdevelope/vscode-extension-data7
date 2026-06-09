' @example: sugar/optional-chain/_expected/02-method-call
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/optional-chain/02-method-call
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Liberar(pForm As TForm)
         If pForm <> NULL Then
            pForm.Free()
         End If
      End Sub
   End Class
End Namespace
