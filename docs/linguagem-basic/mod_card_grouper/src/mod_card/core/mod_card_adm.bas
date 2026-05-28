
Imports mod_enum

'@Module
Namespace mod_card_adm

   Class CardAdm
      Inherits BaseEnum

      Private Shared _Initialized As Boolean

      Private Shared Sub Initialize()
         If _Initialized Then Exit Sub
         BaseEnum._AddEnumItem("CardAdm", New CardAdm(0, "Stone"))
         'BaseEnum._AddEnumItem("CardAdm", New CardAdm(1, "Cielo"))
         _Initialized = True
      End Sub

      Shared Function Stone As CardAdm
         Stone = Load("Stone")
      End Function

      'Shared Function Cielo As CardAdm
      '   Cielo = Load("Cielo")
      'End Function

      Shared Function Load(pValue As CardAdm) As CardAdm
         Load = Load(pValue.AsString)
      End Function

      Shared Function Load(pValue As Integer) As CardAdm
         CardAdm.Initialize()
         Load = CardAdm(BaseEnum._GetCache("CardAdm", pValue))
      End Function

      Shared Function Load(pValue As String) As CardAdm
         CardAdm.Initialize()
         Load = CardAdm(BaseEnum._GetCache("CardAdm", pValue))
      End Function

      Shared Function GetOptions() As String
         CardAdm.Initialize()
         GetOptions = BaseEnum._GetEnumOptions("CardAdm")
      End Function

   End Class

End Namespace