' @example: sugar/decorators/01-singleton
' @demonstrates: decorator @Singleton — ainda exploratório, exemplo do alvo
' @diagnostics: none
'
' Os decorators são uma feature exploratória; o exemplo abaixo mostra o
' alvo de sintaxe pretendido. Por enquanto, é convenção idiomática
' implementar Singleton manualmente:
'
Namespace mod_demo

   Class TCache
      Private Shared _instance As TCache

      Private Sub New()
      End Sub

      Shared Function Instance() As TCache
         If _instance = NULL Then
            _instance = New TCache()
         End If
         Instance = _instance
      End Function

   End Class

End Namespace
