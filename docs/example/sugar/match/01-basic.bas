' @example: sugar/match/01-basic
' @demonstrates: Match x / Case Is TFoo : ... / End Match expandido para If/ElseIf/End If
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(pValue As TObject)
         Match pValue
            Case Is CardRecord : Print "registro"
            Case Is CardRecordList : Print "lista"
            Case Else : Print "desconhecido"
         End Match
      End Sub
   End Class
End Namespace
